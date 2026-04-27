import { describe, it, expect } from "vitest";
import { reconcileResumeAgainstRole } from "../skillReconcile";
import type { ResumeProfile } from "../dashboardData";

const baseProfile: ResumeProfile = {
  headline: "Software engineer",
  summary: "",
  yearsExperience: 5,
  seniorityLevel: "Senior",
  topSkills: [],
  keyAchievements: [],
  industries: [],
  interviewStrengths: [],
  interviewGaps: [],
  careerTrajectory: "",
};

describe("reconcileResumeAgainstRole", () => {
  it("returns empty matched + full missing for an empty profile", () => {
    const r = reconcileResumeAgainstRole(baseProfile, "technical");
    expect(r.matched.length).toBe(0);
    expect(r.missing.length).toBeGreaterThan(0);
    expect(r.coveragePct).toBe(0);
    expect(r.topGaps.length).toBeGreaterThan(0);
    expect(r.topGaps.length).toBeLessThanOrEqual(6);
  });

  it("matches whole-word, case-insensitive", () => {
    const profile: ResumeProfile = {
      ...baseProfile,
      topSkills: ["TypeScript", "PostgreSQL"],
      summary: "Built REST APIs with Node and Redis caching.",
    };
    const r = reconcileResumeAgainstRole(profile, "technical");
    expect(r.matched).toEqual(expect.arrayContaining(["typescript", "node", "redis", "rest", "postgresql"]));
    // "go" must NOT match because we have whole-word boundaries
    expect(r.matched).not.toContain("go");
  });

  it("computes coveragePct relative to vocab size", () => {
    const profile: ResumeProfile = {
      ...baseProfile,
      summary: "Led cross-functional teams. Mentored juniors. Drove delivery.",
    };
    const r = reconcileResumeAgainstRole(profile, "behavioral");
    expect(r.coveragePct).toBeGreaterThan(0);
    expect(r.coveragePct).toBeLessThanOrEqual(100);
  });

  it("topGaps are missing terms (not matched)", () => {
    const profile: ResumeProfile = {
      ...baseProfile,
      summary: "Architecture for distributed scalability — kafka queues.",
    };
    const r = reconcileResumeAgainstRole(profile, "system_design");
    for (const gap of r.topGaps) {
      expect(r.matched).not.toContain(gap);
    }
  });
});
