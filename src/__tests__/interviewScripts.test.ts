/* eslint-disable @typescript-eslint/no-explicit-any -- test file: partial mock objects require any casts */
import { describe, it, expect } from "vitest";
import { scriptsByType, defaultScript, getMiniScript, getScript } from "../interviewScripts";

describe("interviewScripts", () => {
  describe("scriptsByType", () => {
    it("has all 4 interview types", () => {
      expect(Object.keys(scriptsByType)).toEqual(
        expect.arrayContaining(["behavioral", "strategic", "technical", "case-study"])
      );
    });

    it.each(Object.keys(scriptsByType))("%s script starts with intro and ends with closing", (type) => {
      const script = scriptsByType[type];
      expect(script.length).toBeGreaterThanOrEqual(3);
      expect(script[0].type).toBe("intro");
      expect(script[script.length - 1].type).toBe("closing");
    });

    it.each(Object.keys(scriptsByType))("%s script has all required fields on every step", (type) => {
      for (const step of scriptsByType[type]) {
        expect(step.aiText).toBeTruthy();
        expect(step.aiText.length).toBeGreaterThan(10);
        expect(step.thinkingDuration).toBeGreaterThan(0);
        expect(step.speakingDuration).toBeGreaterThan(0);
        expect(typeof step.waitForUser).toBe("boolean");
      }
    });

    it.each(Object.keys(scriptsByType))("%s closing step waits for user", (type) => {
      const script = scriptsByType[type];
      const closing = script.find(s => s.type === "closing");
      expect(closing?.waitForUser).toBe(true);
    });

    it.each(Object.keys(scriptsByType))("%s has 3–5 questions", (type) => {
      const questions = scriptsByType[type].filter(s => s.type === "question");
      expect(questions.length).toBeGreaterThanOrEqual(3);
      // Salary-negotiation has 5 questions for a longer conversation arc
      expect(questions.length).toBeLessThanOrEqual(5);
    });
  });

  describe("defaultScript", () => {
    it("is the behavioral script", () => {
      expect(defaultScript).toBe(scriptsByType.behavioral);
    });
  });

  describe("getMiniScript", () => {
    it("generates 5 steps (intro + 3 questions + closing)", () => {
      const script = getMiniScript(null);
      expect(script.length).toBe(5);
      expect(script[0].type).toBe("intro");
      expect(script[1].type).toBe("question");
      expect(script[2].type).toBe("question");
      expect(script[3].type).toBe("question");
      expect(script[4].type).toBe("closing");
    });

    it("personalizes intro with user name", () => {
      const script = getMiniScript({ name: "Alice", targetRole: "SRE" } as any);
      expect(script[0].aiText).toContain("Alice");
      expect(script[0].aiText).toContain("SRE");
    });

    it("uses generic text when no user", () => {
      const script = getMiniScript(null);
      expect(script[0].aiText).toContain("the role");
      expect(script[0].aiText).not.toContain("undefined");
    });

    it("includes resume context when user has resume", () => {
      const user = {
        name: "Bob",
        targetRole: "CTO",
        resumeFileName: "resume.pdf",
        resumeData: { experience: [{ title: "VP Engineering", company: "Acme" }] },
      } as any;
      const script = getMiniScript(user);
      expect(script[0].aiText).toContain("VP Engineering");
      expect(script[0].aiText).toContain("Acme");
      expect(script[1].aiText).toContain("VP Engineering");
    });

    it("all steps wait for user", () => {
      const script = getMiniScript(null);
      for (const step of script) {
        expect(step.waitForUser).toBe(true);
      }
    });
  });

  describe("getScript", () => {
    it("returns personalized behavioral script by default", () => {
      const script = getScript(null, null, null);
      // intro + 5 randomized questions + closing = 7
      expect(script.length).toBe(7);
      expect(script[0].type).toBe("intro");
      expect(script[0].aiText).toContain("behavioral");
    });

    it("returns correct type when specified", () => {
      const script = getScript("technical", null, null);
      expect(script[0].aiText).toContain("technical");
    });

    it("personalizes with user name and company", () => {
      const user = { name: "Charlie Brown", targetRole: "CTO", targetCompany: "Google", industry: "tech" } as any;
      const script = getScript("strategic", "standard", user);
      expect(script[0].aiText).toContain("Charlie");
      expect(script[0].aiText).toContain("CTO");
      expect(script[0].aiText).toContain("Google");
    });

    it("adjusts durations for warmup difficulty", () => {
      const warmup = getScript("behavioral", "warmup", null);
      const standard = getScript("behavioral", "standard", null);
      // Warmup should have longer speaking durations (1.4x)
      expect(warmup[0].speakingDuration).toBeGreaterThan(standard[0].speakingDuration);
      // Warmup should have longer thinking durations (1.5x)
      expect(warmup[0].thinkingDuration).toBeGreaterThan(standard[0].thinkingDuration);
    });

    it("adjusts durations for intense difficulty", () => {
      const intense = getScript("behavioral", "intense", null);
      const standard = getScript("behavioral", "standard", null);
      // Intense should have shorter durations
      expect(intense[0].speakingDuration).toBeLessThan(standard[0].speakingDuration);
      expect(intense[0].thinkingDuration).toBeLessThan(standard[0].thinkingDuration);
    });

    it("uses encouraging closing prefix based on learning style", () => {
      const user = { learningStyle: "encouraging" } as any;
      const script = getScript("behavioral", null, user);
      const closing = script[script.length - 1];
      expect(closing.aiText).toContain("Really great work");
    });

    it("adds resume context when user has resume", () => {
      const user = { resumeFileName: "cv.pdf" } as any;
      const script = getScript("behavioral", null, user);
      expect(script[0].aiText).toContain("resume");
    });

    it("closing step always waits for user", () => {
      const script = getScript("technical", "intense", null);
      const closing = script[script.length - 1];
      expect(closing.waitForUser).toBe(true);
    });
  });
});
